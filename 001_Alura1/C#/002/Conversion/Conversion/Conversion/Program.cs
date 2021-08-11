using System;

namespace Conversion
{
    class Program
    {
        static void Main(string[] args)
        {
            //float 32 bits variable
            float altura = 1.60f;
            Console.WriteLine(altura);

            //double 64 bits variable
            double salario = 1200.50;

            //int 32 bits variable

            int salarioInteiro = (int)salario;

            Console.WriteLine("Salario em Inteiro: " + salarioInteiro);

            //long 64 bits variable
            long idadeUniverso = 13000000000;

            Console.WriteLine(idadeUniverso);

            //short 16 bits variable
            short quantidadeProdutos = 150;

            Console.WriteLine(quantidadeProdutos);
        }
    }
}
