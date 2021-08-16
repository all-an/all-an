using System;

namespace Conditionals
{
    class Program
    {
        static void Main(string[] args)
        {
            int idadeJoao = 14;

            //int quantidadePessoas = 2;

            //bool acompanhado = quantidadePessoas >= 2;

            bool acompanhado = true;

            if (idadeJoao >= 18 || acompanhado ) //check if bool acompanhado is true
            {
                Console.WriteLine("Pode Entrar");
            }
            else
            {
                Console.WriteLine("Não Pode Entrar");
                
            }

            Console.WriteLine("Hello World!");
        }
    }
}
