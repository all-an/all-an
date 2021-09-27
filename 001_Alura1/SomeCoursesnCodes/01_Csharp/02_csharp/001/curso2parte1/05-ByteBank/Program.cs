using System;

namespace _05_ByteBank
{
    class Program
    {
        static void Main(string[] args)
        {
            /*
            Cliente gabriela = new Cliente();

            gabriela.nome = "Gabriela";
            gabriela.profissao = "Desenvolvedora C#";
            gabriela.cpf = "6666666666";
            */

            ContaCorrente conta = new ContaCorrente();

            //conta.titular = gabriela; //referenciando outro objeto
            conta.titular = new Cliente();
            /*
            conta.titular.cpf = "434.562.878-20";
            conta.titular.profissao = "Desenvolvedora C#";
            conta.saldo = 666;
            conta.agencia = 6666;
            conta.numero = 66666;
            
            conta.titular.nome = "Gabriela Costa";
            */
            if (conta.titular.nome == null)
            {
                Console.WriteLine("Dados do Cliente não existem");
            }

            //Console.WriteLine(gabriela.nome);
            Console.WriteLine(conta.titular.nome); //titular referencia o objeto gabriela
        
            
        
        }
    }
}
