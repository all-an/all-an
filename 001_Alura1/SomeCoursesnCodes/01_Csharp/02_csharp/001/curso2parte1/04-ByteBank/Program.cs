using System;

namespace _04_ByteBank
{
    class Program
    {
        static void Main(string[] args)
        {
            //cria o novo objeto contaDoBruno referênciando ao objeto ContaCorrente()
            ContaCorrente contaDoBruno = new ContaCorrente();

            //atribui valor ao atributo titular dentro do objeto contaDoBruno
            contaDoBruno.titular = "Bruno";


            Console.WriteLine(contaDoBruno.saldo);

            bool resultadoDoSaque = contaDoBruno.Sacar(50);
            Console.WriteLine(contaDoBruno.saldo);

            Console.WriteLine(resultadoDoSaque);

            resultadoDoSaque = contaDoBruno.Sacar(500);
            Console.WriteLine(contaDoBruno.saldo);
            Console.WriteLine(resultadoDoSaque);

            contaDoBruno.Depositar(500);

            Console.WriteLine(contaDoBruno.saldo);

            ContaCorrente contaDaGabriela = new ContaCorrente();

            contaDaGabriela.titular = "Gabriela";

            Console.WriteLine("Saldo do Bruno: " + contaDoBruno.saldo);
            Console.WriteLine("Saldo da Gabriela: " + contaDaGabriela.saldo);


            bool resultadoTransferência = contaDoBruno.Transferir(200, contaDaGabriela);

            Console.WriteLine("Saldo do Bruno: " + contaDoBruno.saldo);
            Console.WriteLine("Saldo da Gabriela: " + contaDaGabriela.saldo);

            Console.WriteLine(resultadoTransferência);

            resultadoTransferência = contaDaGabriela.Transferir(1000, contaDoBruno);

            Console.WriteLine(resultadoTransferência);
        }
    }
}
